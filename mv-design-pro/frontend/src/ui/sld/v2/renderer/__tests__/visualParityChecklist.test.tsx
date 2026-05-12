import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FIELD_ROLE } from '../../domain/apparatusContracts';
import {
  GpzCanonicalRenderer,
  type CanonicalGpzBay,
  type CanonicalGpzCoupler,
  type CanonicalGpzHvSection,
  type CanonicalGpzSection,
  type CanonicalGpzTransformer,
} from '../GpzCanonicalRenderer';
import { MiniBlockRmuRenderer } from '../MiniBlockRmuRenderer';

const REQUIRED_GPZ_PARITY_KEYS = [
  'gpz.root',
  'gpz.frame',
  'gpz.header',
  'gpz.header.transmission',
  'gpz.header.name',
  'gpz.header.address',
  'gpz.header.balance',
  'gpz.header.alarms',
  'gpz.header.control',
  'gpz.header.reset_signals',
  'gpz.hv',
  'gpz.bus.hv',
  'gpz.hv.bay',
  'gpz.transformers',
  'gpz.transformer.symbol',
  'gpz.transformer.winding.hv',
  'gpz.transformer.winding.sn',
  'gpz.section',
  'gpz.bus.sn',
  'gpz.bay',
  'gpz.bay.panel',
  'gpz.bay.power_path',
  'gpz.apparatus.ds.bus',
  'gpz.apparatus.ds',
  'gpz.apparatus.cb.main',
  'gpz.apparatus.cb',
  'gpz.apparatus.ct',
  'gpz.apparatus.ds.line',
  'gpz.apparatus.es.side',
  'gpz.apparatus.cable_head',
  'gpz.status_flags',
  'gpz.measurements',
  'gpz.coupler',
  'gpz.section.label',
] as const;

const REQUIRED_MINI_RMU_PARITY_KEYS = [
  'station.mini.root',
  'station.mini.body',
  'station.mini.name',
  'station.mini.type',
  'station.mini.sn_row',
  'station.mini.bus.sn',
  'station.mini.bay',
  'station.mini.line_switch',
  'station.mini.transformer_field',
  'station.mini.lv_row',
  'station.mini.transformer',
  'station.mini.der_badges',
  'station.mini.der_badge',
  'station.mini.missing',
] as const;

function bay(ref: string, overrides: Partial<CanonicalGpzBay> = {}): CanonicalGpzBay {
  return {
    bayRef: ref,
    bayNumber: '05',
    feederName: 'PODJAZDOWA',
    destinationLabel: 'MST3170',
    fieldRole: 'LINE_OUT',
    cbState: 'closed',
    dsState: 'closed',
    esState: 'open',
    qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
    statusFlags: ['SPZ', 'LRW'],
    measurements: { pMw: 4.1, qMvar: 0.7, i1A: 159 },
    ...overrides,
  };
}

function collectParityKeys(container: HTMLElement): Set<string> {
  return new Set(
    Array.from(container.querySelectorAll('[data-parity-key]'))
      .map((node) => node.getAttribute('data-parity-key'))
      .filter((key): key is string => typeof key === 'string' && key.length > 0),
  );
}

function expectParityKeys(
  container: HTMLElement,
  expected: readonly string[],
): void {
  const keys = collectParityKeys(container);
  const missing = expected.filter((key) => !keys.has(key));
  expect(missing).toEqual([]);
}

describe('SLD visual parity checklist hooks', () => {
  it('GPZ renderer exposes structural parity keys for SCADA evidence', () => {
    const transformer: CanonicalGpzTransformer = {
      transformerRef: 'tr-1',
      designation: 'TR1',
      snMva: 25,
      uhvKv: 110,
      ulvKv: 15,
      vectorGroup: 'YNd11',
    };
    const hvSections: CanonicalGpzHvSection[] = [
      {
        sectionId: 'hv-a',
        order: 1,
        label: '110 kV',
        busVoltageKv: 110,
        bays: [bay('hv-line-1', { bayNumber: 'H1' })],
      },
    ];
    const sections: CanonicalGpzSection[] = [
      {
        sectionId: 's1',
        order: 1,
        label: 'S1',
        busVoltageKv: 15,
        bays: [bay('bay-1')],
      },
      {
        sectionId: 's2',
        order: 2,
        label: 'S2',
        busVoltageKv: 15,
        bays: [bay('bay-2', { bayNumber: '06' })],
      },
    ];
    const couplers: CanonicalGpzCoupler[] = [
      {
        couplerId: 'spr-1',
        leftSectionId: 's1',
        rightSectionId: 's2',
        designation: 'SP',
        closedState: 'closed',
      },
    ];

    const { container } = render(
      <svg>
        <GpzCanonicalRenderer
          id="gpz-parity"
          x={0}
          y={0}
          name="GPZ-8 PGL"
          addressLine="ul. Referencyjna 1"
          radioId="radio nr 587"
          transmissionStatus="ok"
          controlAvailability="remote"
          balance={{ pMw: 3.1, qMvar: 0.4 }}
          alarms={{ enclosureDoorOpen: true }}
          hvSections={hvSections}
          transformers={[transformer]}
          sections={sections}
          couplers={couplers}
          onResetSignals={() => {}}
        />
      </svg>,
    );

    expectParityKeys(container, REQUIRED_GPZ_PARITY_KEYS);
  });

  it('GPZ missing-data states expose parity keys instead of silent gaps', () => {
    const { container } = render(
      <svg>
        <GpzCanonicalRenderer
          id="gpz-missing"
          x={0}
          y={0}
          name="GPZ bez danych WN"
          hvSections={[]}
          transformers={[]}
          sections={[
            {
              sectionId: 's1',
              order: 1,
              label: 'S1',
              busVoltageKv: 15,
              bays: [],
            },
          ]}
          couplers={[]}
        />
      </svg>,
    );

    expectParityKeys(container, ['gpz.hv.missing', 'gpz.transformer.missing']);
  });

  it('mini-RMU renderer exposes structural parity keys for field network evidence', () => {
    const { container } = render(
      <svg>
        <MiniBlockRmuRenderer
          id="st-parity"
          x={0}
          y={0}
          variant="detail"
          footprintType="mv_lv_inline"
          name="ST-01"
          snBays={[
            {
              bayRef: 'rmu-in',
              fieldRole: FIELD_ROLE.RMU_LINE,
              designation: 'L1',
              hasMissingRequiredDevice: false,
            },
            {
              bayRef: 'rmu-out',
              fieldRole: FIELD_ROLE.RMU_LINE,
              designation: 'L2',
              hasMissingRequiredDevice: false,
            },
            {
              bayRef: 'rmu-tr',
              fieldRole: FIELD_ROLE.RMU_TRANSFORMER,
              designation: 'TR',
              hasMissingRequiredDevice: false,
            },
          ]}
          hasTransformer
          transformerRatedKva={630}
          nnFeedersCount={4}
          derBadges={[
            { kind: 'PV', count: 1 },
            { kind: 'BESS', count: 1 },
            { kind: 'FW', count: 1 },
          ]}
          missingData
        />
      </svg>,
    );

    expectParityKeys(container, REQUIRED_MINI_RMU_PARITY_KEYS);
  });
});
