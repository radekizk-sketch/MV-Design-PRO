/**
 * GpzCanonicalRenderer R12-R13 expansion tests.
 *
 * R12 — Hover tooltips (SVG <title>) per bay/transformer/coupler
 * R13 — Outgoing feeders (cable + mini-block destynacji)
 */
import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { GpzCanonicalRenderer } from '../GpzCanonicalRenderer';
import type { GpzCanonicalRendererProps, CanonicalGpzBay } from '../GpzCanonicalRenderer';

function bay(overrides: Partial<CanonicalGpzBay> = {}): CanonicalGpzBay {
  return {
    bayRef: 'bay-1',
    bayNumber: '10',
    feederName: 'PST1',
    destinationLabel: 'STAROŁĘCKA 42',
    fieldRole: 'LINE_OUT',
    cbState: 'closed',
    dsState: 'closed',
    esState: 'open',
    qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
    statusFlags: ['SPZ'],
    measurements: { pMw: 5.5, qMvar: 1.2, u12Kv: 15.3, fHz: 50.01 },
    controlMode: 'remote',
    inManipulation: false,
    ...overrides,
  };
}

function baseProps(overrides: Partial<GpzCanonicalRendererProps> = {}): GpzCanonicalRendererProps {
  return {
    id: 'gpz-test',
    x: 0,
    y: 0,
    name: 'GPZ-TEST',
    transformers: [{
      transformerRef: 'tr-1',
      designation: 'TR1',
      snMva: 25,
      uhvKv: 110,
      ulvKv: 15,
      vectorGroup: 'YNd11',
    }],
    sections: [{
      sectionId: 'sec-1',
      order: 1,
      label: 'S1',
      busVoltageKv: 15,
      bays: [bay()],
    }],
    couplers: [],
    ...overrides,
  };
}

describe('GpzCanonicalRenderer R12 — Hover tooltips (SVG <title>)', () => {
  it('Pole SN ma <title> z numerem + rolą + feeder', () => {
    const { container } = render(<GpzCanonicalRenderer {...baseProps()} />);
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"]');
    const title = bayEl?.querySelector('title');
    expect(title?.textContent).toContain('Pole 10');
    expect(title?.textContent).toContain('liniowe wyjściowe');
    expect(title?.textContent).toContain('PST1');
    cleanup();
  });

  it('Pole SN tooltip zawiera Q-numbery aparatów', () => {
    const { container } = render(<GpzCanonicalRenderer {...baseProps()} />);
    const title = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"] title');
    expect(title?.textContent).toContain('CB Q0:');
    expect(title?.textContent).toContain('DS_BUS Q1:');
    expect(title?.textContent).toContain('DS_LIN Q9:');
    expect(title?.textContent).toContain('ES Q8:');
    cleanup();
  });

  it('Pole SN tooltip zawiera stany aparatów po polsku', () => {
    const { container } = render(<GpzCanonicalRenderer {...baseProps()} />);
    const title = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"] title');
    expect(title?.textContent).toContain('zamknięty');
    cleanup();
  });

  it('Pole SN tooltip zawiera pomiary P/Q/U12/f', () => {
    const { container } = render(<GpzCanonicalRenderer {...baseProps()} />);
    const title = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"] title');
    expect(title?.textContent).toContain('P = 5.50 MW');
    expect(title?.textContent).toContain('Q = 1.20 MVAr');
    expect(title?.textContent).toContain('U12 = 15.30 kV');
    expect(title?.textContent).toContain('f = 50.01 Hz');
    cleanup();
  });

  it('Pole w manipulacji tooltip pokazuje warning', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{
            sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15,
            bays: [bay({ inManipulation: true })],
          }],
        })}
      />,
    );
    const title = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"] title');
    expect(title?.textContent).toContain('POLE W STANIE MANIPULACJI');
    cleanup();
  });

  it('Pole SN tooltip zawiera tryb sterowania', () => {
    const { container } = render(<GpzCanonicalRenderer {...baseProps()} />);
    const title = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"] title');
    expect(title?.textContent).toContain('Sterowanie: zdalne');
    cleanup();
  });

  it('Transformator ma <title> z designation + Sn + napięciami + grupa', () => {
    const { container } = render(<GpzCanonicalRenderer {...baseProps()} />);
    const trEl = container.querySelector('[data-testid="gpz-canonical-transformer-tr-1"]');
    const title = trEl?.querySelector('title');
    expect(title?.textContent).toContain('TR1');
    expect(title?.textContent).toContain('25.0 MVA');
    expect(title?.textContent).toContain('110/15 kV');
    expect(title?.textContent).toContain('YNd11');
    cleanup();
  });

  it('Sprzęgło ma <title> z designation + stan + sekcje', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [
            { sectionId: 's1', order: 1, label: 'S1', busVoltageKv: 15, bays: [] },
            { sectionId: 's2', order: 2, label: 'S2', busVoltageKv: 15, bays: [] },
          ],
          couplers: [{
            couplerId: 'cpl-9',
            leftSectionId: 's1',
            rightSectionId: 's2',
            designation: 'SP-9',
            closedState: 'closed',
          }],
        })}
      />,
    );
    const cplEl = container.querySelector('[data-testid="gpz-canonical-coupler-cpl-9"]');
    const title = cplEl?.querySelector('title');
    expect(title?.textContent).toContain('SP-9');
    expect(title?.textContent).toContain('zamknięty');
    expect(title?.textContent).toContain('s1');
    expect(title?.textContent).toContain('s2');
    cleanup();
  });
});

describe('GpzCanonicalRenderer R13 — Outgoing feeders + mini-block destynacji', () => {
  it('Pole z destinationLabel renderuje OutgoingFeederStub', () => {
    const { container } = render(<GpzCanonicalRenderer {...baseProps()} />);
    const stub = container.querySelector('[data-testid="gpz-canonical-outgoing-feeder"]');
    expect(stub).toBeTruthy();
    expect(stub?.getAttribute('data-destination')).toBe('STAROŁĘCKA 42');
    cleanup();
  });

  it('Pole bez destinationLabel NIE renderuje stub', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{
            sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15,
            bays: [bay({ destinationLabel: null })],
          }],
        })}
      />,
    );
    const stub = container.querySelector('[data-testid="gpz-canonical-outgoing-feeder"]');
    expect(stub).toBeNull();
    cleanup();
  });

  it('Outgoing feeder pokazuje cable number (feederName) + destination label', () => {
    const { container } = render(<GpzCanonicalRenderer {...baseProps()} />);
    const stub = container.querySelector('[data-testid="gpz-canonical-outgoing-feeder"]');
    expect(stub?.textContent).toContain('PST1');
    expect(stub?.textContent).toContain('STAROŁĘCKA 42');
    cleanup();
  });

  it('Outgoing feeder per-role kolor: TRANSFORMER niebieski', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{
            sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15,
            bays: [bay({ fieldRole: 'TRANSFORMER', destinationLabel: 'TR-LV' })],
          }],
        })}
      />,
    );
    const stub = container.querySelector('[data-testid="gpz-canonical-outgoing-feeder"]');
    expect(stub).toBeTruthy();
    /* Tor TR ma niebieski stroke #3B7ABC */
    const line = stub?.querySelector('line');
    expect(line?.getAttribute('stroke')).toBe('#3B7ABC');
    cleanup();
  });

  it('Wiele bays → wiele outgoing feeders renderowanych', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{
            sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15,
            bays: [
              bay({ bayRef: 'b1', destinationLabel: 'STA1' }),
              bay({ bayRef: 'b2', destinationLabel: 'STA2' }),
              bay({ bayRef: 'b3', destinationLabel: 'STA3' }),
            ],
          }],
        })}
      />,
    );
    const stubs = container.querySelectorAll('[data-testid="gpz-canonical-outgoing-feeder"]');
    expect(stubs.length).toBe(3);
    cleanup();
  });

  it('Cable number obcięty do 10 znaków (kanon SCADA)', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{
            sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15,
            bays: [bay({ feederName: 'VERY-LONG-CABLE-NAME-123' })],
          }],
        })}
      />,
    );
    const stub = container.querySelector('[data-testid="gpz-canonical-outgoing-feeder"]');
    /* Wewnętrzny tekst tnie do 10 znaków */
    expect(stub?.textContent).toContain('VERY-LONG-');
    expect(stub?.textContent).not.toContain('VERY-LONG-CABLE-NAME-123');
    cleanup();
  });
});
