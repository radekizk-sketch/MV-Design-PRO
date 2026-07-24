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
import { colorSegmentLabelRows, computeSegmentLabelSlotX } from '../segments';
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
  const rows = colorSegmentLabelRows(computeSegmentLabelSlotX(stations, incomingSegmentLabelTexts));
  const bandsResult = computeBands(
    stations.map((s, i) => bandHeightsFor(s, incomingSegmentLabelTexts[i])),
    rows.rowCount,
  );
  const input: ComputeColumnsInput = {
    stations,
    incomingSegmentLabelTexts,
    nameSlotBand: bandsResult.bands.B5,
    segmentSlotBand: bandsResult.bands.B1,
  };
  const columnsResult = computeColumns(input);
  return { bandsResult, columnsResult, rows };
}

const WIDE_CABLE_LABEL = 'YAKXS 3×120/16 · 90 m — bardzo długi opis odcinka magistrali SN';

// ---------------------------------------------------------------------------
// (a) Segment przęsłowy (r8, poprawka po recenzji F4 REQUEST-CHANGES): slot
// PODSTAWOWY (1, bez leadera) = primaryRect (rezerwacja `columns.ts`), z
// dwoma pod-przypadkami geometrycznymi (czyste centrowanie na przęśle vs.
// bias+clamp do primaryRect). Slot 2 (leader) TYLKO syntetycznie, gdy
// primaryRect celowo za wąski — w widoku sieci z konstrukcji nie występuje.
// ---------------------------------------------------------------------------

describe('V3 labels — segment przęsłowy (spec §4/§5.5, decyzja r8)', () => {
  it('etykieta MIEŚCI SIĘ czysto na przęśle, środek przęsła POZA rezerwacją ⇒ slot 1, dosunięta do krawędzi primaryRect (F10.1: kolorowanie wierszy dowodzi rozłączności TYLKO rezerwacji)', () => {
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
      primaryRect: slot.rect,
    };
    const [label] = resolveLabels({ segmentSpans: [owner] });

    expect(label.slotIndex).toBe(1);
    expect(label.leader).toBeUndefined();
    expect(label.rect.y).toBe(slot.rect.y);
    expect(label.rect.height).toBe(slot.rect.height);
    // F10.1 (korekta nadzorcy): środek przęsła (-100) leży NA LEWO od
    // rezerwacji — etykieta jest dosunięta (clamp) do lewej krawędzi
    // primaryRect; wystawanie poza rezerwację unieważniałoby dowód
    // rozłączności wierszy (`colorSegmentLabelRows`).
    expect(label.rect.x).toBe(slot.rect.x);
    expect(Math.abs(label.rect.x % GRID)).toBe(0); // lewa krawędź slotu na siatce (spec §2)
  });

  it('F10.1: etykieta mieści się na przęśle, środek przęsła WEWNĄTRZ rezerwacji ⇒ wycentrowana na przęśle (clamp nieaktywny)', () => {
    const station = makeStation('s1', 4, 2);
    const { bandsResult, columnsResult } = buildPipeline([station], ['x']);
    const slot = columnsResult.segmentLabelSlots[0];
    // Przęsło w całości WEWNĄTRZ rezerwacji ⇒ centrowanie działa jak przed
    // F10.1 (clamp jest no-opem, gdy wycentrowana etykieta mieści się w
    // primaryRect).
    const spanStart = slot.rect.x;
    const spanEnd = slot.rect.x + slot.rect.width;
    const owner: SegmentSpanOwnerInput = {
      ownerRef: 'seg-centered',
      text: 'x',
      spanStart,
      spanEnd,
      busAxisY: bandsResult.bands.B2.y,
      primaryRect: slot.rect,
    };
    const [label] = resolveLabels({ segmentSpans: [owner] });
    const spanCenter = (spanStart + spanEnd) / 2;
    const labelCenter = label.rect.x + label.rect.width / 2;
    expect(Math.abs(labelCenter - spanCenter)).toBeLessThan(GRID);
  });

  it('przęsło WĄSKIE (norma dzisiejsza: krawędzie kolumn, GAP=24px << etykieta kabla) ⇒ slot 1 W primaryRect, x biasowany ku środkowi przęsła i dosunięty do kolumny, BEZ leadera', () => {
    // Dwie wąskie stacje sąsiadujące z bardzo długą etykietą ⇒ sloty się
    // nakładają w X ⇒ kolorowanie wymusza ≥2 wiersze (r9, patrz layout.test.ts).
    const stationA = makeStation('a', 1, 1);
    const stationB = makeStation('b', 1, 1);
    const { bandsResult, columnsResult, rows } = buildPipeline(
      [stationA, stationB],
      [WIDE_CABLE_LABEL, WIDE_CABLE_LABEL],
    );
    expect(rows.rowCount).toBeGreaterThanOrEqual(2);

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
      primaryRect: slotA.rect,
    };
    const ownerB: SegmentSpanOwnerInput = {
      ownerRef: 'seg-b',
      text: WIDE_CABLE_LABEL,
      spanStart: spanBStart,
      spanEnd: spanBEnd,
      busAxisY: bandsResult.bands.B2.y,
      primaryRect: slotB.rect,
    };

    const [labelA, labelB] = resolveLabels({ segmentSpans: [ownerA, ownerB] });

    for (const label of [labelA, labelB]) {
      expect(label.slotIndex).toBe(1);
      expect(label.leader).toBeUndefined();
    }
    // Etykieta mieści się W primaryRect (rezerwacja columns.ts) — nie
    // wystaje poza kolumnę stacji docelowej.
    expect(labelA.rect.x).toBeGreaterThanOrEqual(slotA.rect.x);
    expect(labelA.rect.x + labelA.rect.width).toBeLessThanOrEqual(slotA.rect.x + slotA.rect.width);
    expect(labelB.rect.x).toBeGreaterThanOrEqual(slotB.rect.x);
    expect(labelB.rect.x + labelB.rect.width).toBeLessThanOrEqual(slotB.rect.x + slotB.rect.width);
    expect(labelA.rect.y).toBe(slotA.rect.y);
    expect(labelB.rect.y).toBe(slotB.rect.y);
    // Wiersz z kolorowania: sąsiednie stacje trafiają w RÓŻNE wiersze B1.
    expect(labelA.rect.y).not.toBe(labelB.rect.y);
  });

  it('szerokie przęsło ze środkiem poza rezerwacją ⇒ etykieta dosunięta do krawędzi primaryRect (F10.1 — rozłączność rezerwacji > centrowanie)', () => {
    const station = makeStation('s1', 1, 1);
    const { bandsResult, columnsResult } = buildPipeline([station], ['15 kV']);
    const slot = columnsResult.segmentLabelSlots[0];
    // Przęsło znacznie szersze niż etykieta 't2' „15 kV" (~34px) — imitacja
    // przyszłego tap-do-tap (F5), gdzie odległość między stacjami jest duża.
    const spanStart = -1000;
    const spanEnd = columnsResult.columns[0].x; // 0
    const owner: SegmentSpanOwnerInput = {
      ownerRef: 'seg-wide-span',
      text: '15 kV',
      spanStart,
      spanEnd,
      busAxisY: bandsResult.bands.B2.y,
      primaryRect: slot.rect,
    };
    const [label] = resolveLabels({ segmentSpans: [owner] });

    expect(label.slotIndex).toBe(1);
    expect(label.leader).toBeUndefined();
    // F10.1 (korekta nadzorcy): środek przęsła (-500) daleko na lewo od
    // rezerwacji — etykieta dosunięta do lewej krawędzi primaryRect (clamp),
    // NIE wycentrowana; wystawanie poza rezerwację łamało dowód rozłączności
    // wierszy (realna kolizja S01↔S02 na fixturze po poszerzeniu kolumn
    // §18.1 — patrz `resolveSegmentSpanLabel`).
    expect(label.rect.x).toBe(slot.rect.x);
  });

  it('SYNTETYCZNIE: primaryRect celowo za wąski dla etykiety, brak marginRect ⇒ rzuca (slot 2 wymaga dostarczonej rezerwacji)', () => {
    const tinyPrimaryRect: V3Rect = { x: 0, y: 100, width: 4, height: 24 };
    expect(() =>
      resolveLabels({
        segmentSpans: [
          {
            ownerRef: 'seg-too-narrow',
            text: WIDE_CABLE_LABEL,
            spanStart: -10,
            spanEnd: 0,
            busAxisY: 100,
            primaryRect: tinyPrimaryRect,
          },
        ],
      }),
    ).toThrow();
  });

  it('SYNTETYCZNIE: primaryRect celowo za wąski, marginRect dostarczony ⇒ slot 2 + leader OBOWIĄZKOWY do środka przęsła', () => {
    const tinyPrimaryRect: V3Rect = { x: 0, y: 100, width: 4, height: 24 };
    const marginRect: V3Rect = { x: 500, y: 400, width: 200, height: 24 };
    const spanStart = -10;
    const spanEnd = 0;
    const [label] = resolveLabels({
      segmentSpans: [
        {
          ownerRef: 'seg-too-narrow',
          text: WIDE_CABLE_LABEL,
          spanStart,
          spanEnd,
          busAxisY: 100,
          primaryRect: tinyPrimaryRect,
          marginRect,
        },
      ],
    });

    expect(label.slotIndex).toBe(2);
    expect(label.leader).toBeDefined();
    expect(leaderInvariantHolds([label])).toBe(true);
    expect(label.rect).toEqual(marginRect);
    expect(label.leader!.to.x).toBeCloseTo((spanStart + spanEnd) / 2, 5);
    expect(label.leader!.to.y).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// (a2) INTEGRACJA columns→labels (r7b, F5a): `spanStart`/`spanEnd` REALNE
// (`ColumnResult.tapX`, nie krawędzie kolumn) ⇒ etykieta w normalnym
// przypadku ląduje w slocie 1, WYŚRODKOWANA na przęśle, BEZ leadera i BEZ
// clampa do primaryRect (spec §5.2/§4, decyzja nadzorcy r7b w columns.ts).
// ---------------------------------------------------------------------------

describe('V3 labels — integracja columns→labels z REALNYM tapX (r7b)', () => {
  it('dwie zwyczajne stacje, umiarkowana etykieta kabla ⇒ slot 1, wyśrodkowana na REALNYM przęśle tap-do-tap, bez leadera', () => {
    const stationA = makeStation('a', 10, 3);
    const stationB = makeStation('b', 10, 3);
    const segmentTexts = [null, 'YAKXS 3×120/16 · 40 m'];
    const { bandsResult, columnsResult } = buildPipeline([stationA, stationB], segmentTexts);

    const slot = columnsResult.segmentLabelSlots.find((s) => s.stationIndex === 1)!;
    const tapPrev = columnsResult.columns[0].tapX;
    const tapThis = columnsResult.columns[1].tapX;
    // Przęsło tap-do-tap jest REALNE (nie krawędzie kolumn/GAP=24px) — dużo
    // szersze niż potrzebuje umiarkowana etykieta kabla.
    expect(tapThis - tapPrev).toBeGreaterThan(100);

    const owner: SegmentSpanOwnerInput = {
      ownerRef: 'seg-b',
      text: segmentTexts[1]!,
      spanStart: tapPrev,
      spanEnd: tapThis,
      busAxisY: bandsResult.bands.B2.y,
      primaryRect: slot.rect,
    };
    const [label] = resolveLabels({ segmentSpans: [owner] });

    expect(label.slotIndex).toBe(1);
    expect(label.leader).toBeUndefined();
    const spanCenter = (tapPrev + tapThis) / 2;
    const labelCenter = label.rect.x + label.rect.width / 2;
    // Wyśrodkowana NA PRZĘŚLE (z tolerancją snap-to-grid) — NIE zaklamrowana
    // do krawędzi `primaryRect` (który jest tu tap-centered, ale zwykle
    // szerszy niż etykieta — patrz `columns.ts` r7b: `rect.width =
    // snapUp(requiredSegmentLabelWidth(text))`).
    expect(Math.abs(labelCenter - spanCenter)).toBeLessThan(GRID);
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
          primaryRect: slot.rect,
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
          primaryRect: slot.rect,
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
          primaryRect: slot.rect,
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

// ---------------------------------------------------------------------------
// W5 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §12–15/uwaga 7) — passthrough
// przeznaczenia CT (`Measurement.purpose`) przez `resolveSimpleAnchoredLabel`
// GEOMETRYCZNIE NEUTRALNY: `ctPurpose` na OwnedLabel, `rect` identyczny jak bez
// niego (kanał audytu `data-ct-purpose`, nie tekst — inwariant „geometria bez
// dryfu"). Wzorzec `designationSource` (Z3).
// ---------------------------------------------------------------------------
describe('V3 labels — W5: ctPurpose passthrough (geometrycznie neutralny)', () => {
  const base = {
    ownerRef: 'bay-1#ct-rating-ct1',
    ownerKind: 'protection' as const,
    text: 'CT1 · 300/5',
    labelClass: 't4' as const,
    anchor: { x: 200, y: 120 },
    placement: 'right' as const,
  };

  it('przenosi ctPurpose na OwnedLabel, gdy dana obecna', () => {
    const [withPurpose] = resolveLabels({ simpleAnchored: [{ ...base, ctPurpose: 'metering' }] });
    expect(withPurpose.ctPurpose).toBe('metering');
  });

  it('rect IDENTYCZNY z ctPurpose i bez (zero wpływu na geometrię/kotwice)', () => {
    const [withPurpose] = resolveLabels({ simpleAnchored: [{ ...base, ctPurpose: 'protection' }] });
    const [without] = resolveLabels({ simpleAnchored: [base] });
    expect(withPurpose.rect).toEqual(without.rect);
    expect(withPurpose.text).toBe(without.text);
    expect(without.ctPurpose).toBeUndefined();
  });
});
