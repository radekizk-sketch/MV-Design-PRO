/**
 * PR-6 — testy StationInternalView (wewnętrzny SLD stacji).
 *
 * Inwarianty (BINDING):
 * 1. Brief 2 §7: 3 tryby (zewnętrzny/wewnętrzny/mieszany).
 * 2. Stacja musi mieć szynę SN + pola + transformator + rozdzielnicę nN.
 * 3. Multi-voltage nN (briefa §13): wiele rozdzielnic per poziom napięcia.
 * 4. Brief 2 §6 pkt 7: typ topologiczny wnioskowany z portów (nie z station_type).
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StationInternalView } from '../canvas/StationInternalView';

describe('StationInternalView — minimal terminal station', () => {
  it('renderuje header z nazwą i typem topologicznym', () => {
    const { getByText, container } = render(
      <StationInternalView
        substationId="st1"
        name="Stacja ST-01"
        topologicalType="końcowa"
        snVoltageKv={15}
        nnVoltageLevels={[0.4]}
        bays={[]}
        transformers={[]}
        nnSwitchgears={[]}
        width={1000}
        height={700}
      />,
    );
    expect(getByText('Stacja ST-01')).toBeInTheDocument();
    expect(getByText(/Typ topologiczny: końcowa/)).toBeInTheDocument();
    expect(container.querySelector('[data-element-kind="station_internal"]')).toBeTruthy();
  });

  it('renderuje pola SN z aparatami', () => {
    const { container, getByText } = render(
      <StationInternalView
        substationId="st1"
        name="Stacja"
        topologicalType="przelotowa"
        snVoltageKv={15}
        nnVoltageLevels={[]}
        bays={[
          {
            bayId: 'b1',
            designation: 'Pole 1',
            bayRole: 'IN',
            devices: [
              { id: 'q0', kind: 'CB', designationQ: 'Q0', state: 'closed' },
            ],
          },
          {
            bayId: 'b2',
            designation: 'Pole 2',
            bayRole: 'OUT',
            devices: [
              { id: 'q0_b2', kind: 'CB', designationQ: 'Q0', state: 'open' },
            ],
          },
        ]}
        transformers={[]}
        nnSwitchgears={[]}
        width={1000}
        height={700}
      />,
    );
    expect(container.querySelector('[data-testid="sld-v2-bay-b1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-bay-b2"]')).toBeTruthy();
    expect(getByText('Pole 1')).toBeInTheDocument();
    expect(getByText('Pole 2')).toBeInTheDocument();
  });
});

describe('StationInternalView — transformator', () => {
  it('renderuje transformator SN/nN z 2 okręgami i parametrami', () => {
    const { container, getByText } = render(
      <StationInternalView
        substationId="st1"
        name="ST-01"
        topologicalType="końcowa"
        snVoltageKv={15}
        nnVoltageLevels={[0.4]}
        bays={[]}
        transformers={[
          {
            transformerId: 'tr1',
            designation: 'TR1',
            snMva: 0.4,
            uhvKv: 15,
            ulvKv: 0.4,
          },
        ]}
        nnSwitchgears={[]}
        width={1000}
        height={700}
      />,
    );
    expect(container.querySelector('[data-testid="sld-v2-transformer-tr1"]')).toBeTruthy();
    expect(getByText('TR1')).toBeInTheDocument();
    expect(getByText('0.4 MVA')).toBeInTheDocument();
    expect(getByText('15/0.4 kV')).toBeInTheDocument();
  });
});

describe('StationInternalView — multi-voltage nN (brief §13)', () => {
  it('industrial: 3 rozdzielnice nN dla [6.0, 0.69, 0.4]', () => {
    const { container, getByText } = render(
      <StationInternalView
        substationId="st_ind"
        name="Stacja przemysłowa"
        topologicalType="przelotowa"
        constructionType="wnetrzowa"
        snVoltageKv={15}
        nnVoltageLevels={[6.0, 0.69, 0.4]}
        bays={[]}
        transformers={[]}
        nnSwitchgears={[
          { designation: 'RnN-6kV-1', nnVoltageKv: 6.0, feedersCount: 8 },
          { designation: 'RnN-0.69kV-2', nnVoltageKv: 0.69, feedersCount: 6 },
          { designation: 'RnN-0.4kV-3', nnVoltageKv: 0.4, feedersCount: 12 },
        ]}
        width={1200}
        height={900}
      />,
    );
    expect(getByText('RnN-6kV-1')).toBeInTheDocument();
    expect(getByText('RnN-0.69kV-2')).toBeInTheDocument();
    expect(getByText('RnN-0.4kV-3')).toBeInTheDocument();
    expect(getByText(/Konstrukcja: wnętrzowa/)).toBeInTheDocument();
    expect(getByText(/Poziomy nN: 6\s*\/\s*0\.69\s*\/\s*0\.4 kV/)).toBeInTheDocument();
  });
});

describe('StationInternalView — interakcje', () => {
  it('onClose handler wywoływany po kliknięciu x', () => {
    let closed = false;
    const { container } = render(
      <StationInternalView
        substationId="st1"
        name="ST"
        topologicalType="końcowa"
        snVoltageKv={15}
        nnVoltageLevels={[]}
        bays={[]}
        transformers={[]}
        nnSwitchgears={[]}
        width={800}
        height={600}
        onClose={() => { closed = true; }}
      />,
    );
    // Simulujemy klik na "×"
    const xButton = container.querySelector('text');
    // Znajdujemy element zawierający tekst "×"
    const allTexts = container.querySelectorAll('text');
    const closeText = Array.from(allTexts).find((t) => t.textContent === '×');
    expect(closeText).toBeTruthy();
    if (closeText) {
      const parent = closeText.closest('g');
      parent?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(closed).toBe(true);
    }
  });
});
