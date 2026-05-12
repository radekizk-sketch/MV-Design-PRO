/**
 * PR 3 (minimal) — Test strukturalny: GPZ LOD≥2 pokazuje sekcje SN + pola +
 * symbole transformatorów 110/SN. Guard wizualnej jakości operatorskiej —
 * uniemożliwia regresję do "GPZ=pojedynczy prostokąt" lub "GPZ bez TR".
 *
 * Reguła: GpzSwitchgearRenderer musi mieć:
 *  - `sld-v2-gpz-switchgear-<id>` (kontener),
 *  - przynajmniej jeden bus (HV lub main),
 *  - przynajmniej jeden symbol transformatora (`sld-v2-gpz-switchgear-transformer-symbol`)
 *    gdy renderowany jest tryb two-bus (z hvSections),
 *  - sekcję LV main bus.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { GpzSwitchgearRenderer } from '../GpzSwitchgearRenderer';
import type {
  GpzBayDescriptor,
  GpzCouplerDescriptor,
  GpzSectionDescriptor,
} from '../GpzSwitchgearRenderer';

function makeBay(bayRef: string, designation: string): GpzBayDescriptor {
  return {
    bayRef,
    fieldRole: 'GPZ_LINE_BAY',
    designation,
    hasMissingRequiredDevice: false,
  };
}

const SECTIONS_LV: GpzSectionDescriptor[] = [
  {
    sectionId: 's1',
    order: 0,
    name: 'S1',
    busVoltageKv: 15,
    bays: [makeBay('b1', 'P1'), makeBay('b2', 'P2')],
    sectionLabel: 'S1',
  },
  {
    sectionId: 's2',
    order: 1,
    name: 'S2',
    busVoltageKv: 15,
    bays: [makeBay('b3', 'P3'), makeBay('b4', 'P4')],
    sectionLabel: 'S2',
  },
];

const SECTIONS_HV: GpzSectionDescriptor[] = [
  {
    sectionId: 'hv_s1',
    order: 0,
    name: 'HV-S1',
    busVoltageKv: 110,
    bays: [makeBay('hv_b1', 'HV1')],
    sectionLabel: 'HV-S1',
  },
];

const COUPLERS: GpzCouplerDescriptor[] = [
  {
    couplerId: 'cpl_1',
    leftSectionId: 's1',
    rightSectionId: 's2',
    designation: 'Q-CPL',
    closed: 'closed',
  },
];

describe('GpzSwitchgearRenderer — visible structural elements (PR 3 minimal guard)', () => {
  it('two-bus GPZ: sekcje SN + sekcje HV + symbol transformatora widoczne', () => {
    const { container } = render(
      <svg>
        <GpzSwitchgearRenderer
          id="gpz_two"
          x={0}
          y={0}
          name="GPZ 110/15"
          voltageHighKv={110}
          voltageLowKv={15}
          sections={SECTIONS_LV}
          couplers={COUPLERS}
          hvSections={SECTIONS_HV}
          hvCouplers={[]}
          transformerCount={2}
        />
      </svg>,
    );

    // Kontener obecny.
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-gpz_two"]')).not.toBeNull();

    // ≥1 HV bus.
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-hv-bus"]')).not.toBeNull();

    // ≥1 LV bus.
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-lv-bus"]')).not.toBeNull();

    // ≥2 symbole transformatorów 110/SN — kanon GPZ.
    const trSymbols = container.querySelectorAll(
      '[data-testid="sld-v2-gpz-switchgear-transformer-symbol"]',
    );
    expect(trSymbols.length).toBeGreaterThanOrEqual(2);

    // Każdy TR ma data-tr-index (numerację 0..n).
    expect(trSymbols[0].getAttribute('data-tr-index')).toBe('0');
    expect(trSymbols[1].getAttribute('data-tr-index')).toBe('1');

    // ≥1 etykieta sekcji LV (np. "S1").
    const sectionLabels = container.querySelectorAll(
      '[data-testid^="sld-v2-gpz-section-label-"]',
    );
    expect(sectionLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('GPZ z polami liniowymi (outgoingFeeder) pokazuje strefę pól SN', () => {
    const sectionsWithFeeders: GpzSectionDescriptor[] = [
      {
        ...SECTIONS_LV[0],
        bays: [
          {
            ...makeBay('b1', 'P1'),
            fieldRole: 'GPZ_LINE_BAY',
            outgoingFeeder: {
              destination: '→ ST-001 SADY',
              feederNumber: 'L-203',
              catalogLabel: 'XRUHAKXS 120/25',
              segmentLengthLabel: '500 m',
              energized: true,
            },
          },
        ],
      },
    ];
    const { container } = render(
      <svg>
        <GpzSwitchgearRenderer
          id="gpz_zone"
          x={0}
          y={0}
          name="GPZ"
          voltageHighKv={110}
          voltageLowKv={15}
          sections={sectionsWithFeeders}
          couplers={[]}
          hvSections={SECTIONS_HV}
          transformerCount={1}
        />
      </svg>,
    );

    const trunkZone = container.querySelector('[data-testid="sld-v2-gpz-field-trunk-zone"]');
    expect(trunkZone).not.toBeNull();
    const feederCount = trunkZone?.getAttribute('data-feeder-count');
    expect(feederCount).toBe('1');
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-b1"]'),
    ).not.toBeNull();
  });

  it('GPZ NIE redukuje się do <rect> — ma >5 grup data-testid', () => {
    const { container } = render(
      <svg>
        <GpzSwitchgearRenderer
          id="gpz_anti_blob"
          x={0}
          y={0}
          name="GPZ"
          voltageHighKv={110}
          voltageLowKv={15}
          sections={SECTIONS_LV}
          couplers={COUPLERS}
          hvSections={SECTIONS_HV}
          transformerCount={2}
        />
      </svg>,
    );
    const root = container.querySelector('[data-testid="sld-v2-gpz-switchgear-gpz_anti_blob"]');
    expect(root).not.toBeNull();
    const allTestIds = root?.querySelectorAll('[data-testid]');
    expect(
      allTestIds?.length ?? 0,
      'GPZ ma za mało elementów strukturalnych — wygląda jak prosty prostokąt',
    ).toBeGreaterThan(5);
  });
});
