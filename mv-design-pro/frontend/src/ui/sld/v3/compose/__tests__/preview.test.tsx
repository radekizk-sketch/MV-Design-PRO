/**
 * SLD V3 F5b — smoke-test `CompositionPreview` (harness DEBUG, spec §6).
 * Nie jest wyrocznią spec §11 (to zakres `gpz.test.ts`/`station.test.ts`) —
 * sprawdza WYŁĄCZNIE, że harness renderuje kompozycje `compose/gpz.ts` i
 * `compose/station.ts` bez wyjątków i przepisuje meta na atrybuty debug.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import type {
  CanonicalGpzSection,
  CanonicalGpzTransformer,
  GpzCanonicalRendererProps,
} from '../../../v2/renderer/GpzCanonicalRenderer';
import { FIELD_ROLE } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import { colorSegmentLabelRows, computeSegmentLabelSlotX } from '../../layout/segments';
import { computeBands, type StationBandHeights } from '../../layout/bands';
import { computeColumns, type ComputeColumnsInput } from '../../layout/columns';
import { resolveLabels } from '../../layout/labels';
import { stationBlockHeight, type StationMeasureInput } from '../../layout/measure';
import { composeStation, type ComposeStationInput } from '../station';
import { composeGpz } from '../gpz';
import { CompositionPreview, type PreviewComposition } from '../preview';

describe('V3 compose/preview — CompositionPreview (harness DEBUG, GPZ)', () => {
  it('renderuje kompozycję GPZ (symbole + odcinki + etykiety) bez wyjątków', () => {
    const TR1: CanonicalGpzTransformer = {
      transformerRef: 'tr-1',
      designation: 'TR1',
      snMva: 25,
      uhvKv: 110,
      ulvKv: 15,
      vectorGroup: 'YNd11',
    };
    const props: GpzCanonicalRendererProps = {
      id: 'gpz-preview',
      x: 0,
      y: 0,
      name: 'GPZ PODGLĄD',
      transformers: [TR1],
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          label: 'S1',
          busVoltageKv: 15,
          // topology='double' → szyna rezerwowa dashed (FIX-E: kind='bus' +
          // meta.dashed przenoszone do PreviewSegment, sprawdzane niżej).
          busbarTopology: 'double',
          bays: [
            {
              bayRef: 'b-1',
              bayNumber: '1',
              feederName: 'ODPŁYW 1',
              destinationLabel: 'ST-01',
              fieldRole: 'LINE_OUT',
              cbState: 'closed',
              dsState: 'closed',
              esState: 'open',
              qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
            },
          ],
        } satisfies CanonicalGpzSection,
      ],
      couplers: [],
    };

    const composition = composeGpz(props, { x: 0, y: 0 });
    const labels = resolveLabels({
      stationNameBands: [composition.labels.stationName, ...composition.labels.transformerLabels],
      // FIX-E: sectionLabels (napięcie+etykieta sekcji, ownerKind
      // 'busbar-voltage') nie były przekazywane do resolveLabels — gubione
      // w harnessu podglądu.
      simpleAnchored: [...composition.labels.fieldDesignations, ...composition.labels.sectionLabels],
      portCaptions: composition.labels.fieldCaptions,
    });
    const preview: PreviewComposition = {
      symbols: composition.symbols,
      segments: composition.segments.map((s) => ({
        points: s.points,
        meta: {
          parityKeys: s.meta.parityKeys,
          testId: s.meta.testId,
          // FIX-E: ring-closure (meta.ringClosure) jest szyną (kind='bus'),
          // nie samym busbarRole.
          kind: s.meta.busbarRole || s.meta.ringClosure ? 'bus' : 'sn',
          dashed: s.meta.dashed,
        },
      })),
      labels,
    };

    const { container } = render(<CompositionPreview composition={preview} width={800} height={600} />);
    expect(container.querySelector('[data-testid="sld-v3-composition-preview"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-symbol-canon]').length).toBe(composition.symbols.length);
    expect(container.querySelectorAll('[data-preview-layer="segments"] path').length).toBe(composition.segments.length);
    // Meta przepisana na atrybuty debug (spec zadania: parity/testId).
    const hvConnectorPath = Array.from(container.querySelectorAll('path')).find(
      (p) => p.getAttribute('data-parity-key') === 'gpz.transformer.hv_connector',
    );
    expect(hvConnectorPath).toBeTruthy();

    // FIX-E (1): etykieta sekcji ("S1 · 15 kV") nie jest gubiona przez harness.
    const labelTexts = Array.from(container.querySelectorAll('[data-preview-layer="labels"] text')).map((t) => t.textContent);
    expect(labelTexts).toContain('S1 · 15 kV');

    // FIX-E (2): szyna rezerwowa (dashed, topology='double') dostaje
    // strokeDasharray w renderze.
    const reservePath = Array.from(container.querySelectorAll('path')).find(
      (p) => p.getAttribute('data-parity-key') === 'gpz.bus.sn.s2',
    );
    expect(reservePath).toBeTruthy();
    expect(reservePath?.getAttribute('stroke-dasharray')).toBeTruthy();
    // Szyna PRIMARY (nie dashed) nie ma strokeDasharray.
    const primaryPath = Array.from(container.querySelectorAll('path')).find(
      (p) => p.getAttribute('data-parity-key') === 'gpz.bus.sn',
    );
    expect(primaryPath?.getAttribute('stroke-dasharray')).toBeFalsy();
  });

  it('mapowanie kind: ring-closure (meta.ringClosure, bez busbarRole) renderuje się jako szyna (stroke-width=4)', () => {
    const TR1: CanonicalGpzTransformer = {
      transformerRef: 'tr-1',
      designation: 'TR1',
      snMva: 25,
      uhvKv: 110,
      ulvKv: 15,
      vectorGroup: 'YNd11',
    };
    const props: GpzCanonicalRendererProps = {
      id: 'gpz-preview-ring',
      x: 0,
      y: 0,
      name: 'GPZ PODGLĄD RING',
      transformers: [TR1],
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          label: 'S1',
          busVoltageKv: 15,
          busbarTopology: 'ring',
          bays: [
            {
              bayRef: 'b-1',
              bayNumber: '1',
              feederName: 'ODPŁYW 1',
              destinationLabel: 'ST-01',
              fieldRole: 'LINE_OUT',
              cbState: 'closed',
              dsState: 'closed',
              esState: 'open',
              qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
            },
          ],
        } satisfies CanonicalGpzSection,
      ],
      couplers: [],
    };

    const composition = composeGpz(props, { x: 0, y: 0 });
    const labels = resolveLabels({
      stationNameBands: [composition.labels.stationName, ...composition.labels.transformerLabels],
      simpleAnchored: [...composition.labels.fieldDesignations, ...composition.labels.sectionLabels],
      portCaptions: composition.labels.fieldCaptions,
    });
    const preview: PreviewComposition = {
      symbols: composition.symbols,
      segments: composition.segments.map((s) => ({
        points: s.points,
        meta: {
          parityKeys: s.meta.parityKeys,
          testId: s.meta.testId,
          kind: s.meta.busbarRole || s.meta.ringClosure ? 'bus' : 'sn',
          dashed: s.meta.dashed,
        },
      })),
      labels,
    };

    const { container } = render(<CompositionPreview composition={preview} width={800} height={600} />);
    const ringClosurePath = Array.from(container.querySelectorAll('path')).find(
      (p) => p.getAttribute('data-parity-key') === 'gpz.bus.sn.ring-closure',
    );
    expect(ringClosurePath).toBeTruthy();
    expect(ringClosurePath?.getAttribute('stroke-width')).toBe('4');
  });
});

describe('V3 compose/preview — CompositionPreview (harness DEBUG, stacja)', () => {
  function makeStation(): StationMeasureInput {
    return {
      id: 'st-1',
      name: 'Stacja Przykładowa',
      stationCode: 'S01',
      transformerRatedKva: 630,
      stationTypeLabel: 'stacja przelotowa',
      snBays: [
        { bayRef: 'bay-0', fieldRole: FIELD_ROLE.RMU_LINE, designation: 'L1', hasMissingRequiredDevice: false } satisfies MiniBlockBayDescriptor,
        { bayRef: 'bay-1', fieldRole: FIELD_ROLE.RMU_TRANSFORMER, designation: 'TR', hasMissingRequiredDevice: false } satisfies MiniBlockBayDescriptor,
      ],
    };
  }

  it('renderuje kompozycję stacji (compose/station.ts) bez wyjątków', () => {
    const station = makeStation();
    const rows = colorSegmentLabelRows(computeSegmentLabelSlotX([station], [null]));
    const bandHeights: StationBandHeights = {
      incomingSegmentLabelText: null,
      portCaptionHeight: 0,
      stationBlockHeight: stationBlockHeight(station),
      nameBandHeight: 40,
    };
    const bandsResult = computeBands([bandHeights], rows.rowCount);
    const columnsInput: ComputeColumnsInput = {
      stations: [station],
      incomingSegmentLabelTexts: [null],
      nameSlotBand: bandsResult.bands.B5,
      segmentSlotBand: bandsResult.bands.B1,
    };
    const { columns } = computeColumns(columnsInput);
    const column = columns[0];
    const composeInput: ComposeStationInput = {
      station,
      column: { x: column.x, width: column.width, tapX: column.tapX },
      busAxisY: bandsResult.bands.B2.y,
      blockTopY: bandsResult.bands.B4.y,
      nameSlot: column.nameSlot,
    };
    const composition = composeStation(composeInput);
    const labels = resolveLabels({
      stationNameBands: [composition.labels.stationName],
      simpleAnchored: [...composition.labels.apparatus, ...composition.labels.der],
      portCaptions: composition.labels.portCaptions,
    });
    const preview: PreviewComposition = {
      symbols: composition.symbols,
      segments: composition.segments.map((s) => ({ points: s.points })),
      labels,
    };

    const { container } = render(<CompositionPreview composition={preview} width={600} height={400} />);
    expect(container.querySelectorAll('[data-symbol-canon]').length).toBe(composition.symbols.length);
  });
});
