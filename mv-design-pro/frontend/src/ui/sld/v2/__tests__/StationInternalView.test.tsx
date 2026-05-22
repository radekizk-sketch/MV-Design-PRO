/**
 * PR-6 — testy StationInternalView (wewnętrzny SLD stacji).
 *
 * Inwarianty (BINDING):
 * 1. Brief 2 §7: 3 tryby (zewnętrzny/wewnętrzny/mieszany).
 * 2. Stacja musi mieć szynę SN + pola + transformator + rozdzielnicę nN.
 * 3. Multi-voltage nN (briefa §13): wiele rozdzielnic per poziom napięcia.
 * 4. Brief 2 §6 pkt 7: typ topologiczny wnioskowany z portów (nie z station_type).
 */

import { render, screen } from '@testing-library/react';
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

  it('uzupelnia puste dane stacji o czytelne pola WE/WY/TR i kanoniczne aparaty', () => {
    const { container, getByText } = render(
      <StationInternalView
        substationId="st-empty"
        name="Stacja pusta"
        topologicalType="przelotowa"
        snVoltageKv={15}
        nnVoltageLevels={[0.4]}
        bays={[]}
        transformers={[]}
        nnSwitchgears={[]}
        width={1000}
        height={620}
      />,
    );

    expect(getByText('WE')).toBeInTheDocument();
    expect(getByText('WY')).toBeInTheDocument();
    expect(screen.getAllByText('TR').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('[data-parity-key^="station.internal.bay.panel."]').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('[data-symbol-canon="switch_disconnector_rotated_square"]').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('[data-symbol-canon="earthing_switch_lateral_branch"]').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-element-kind="transformer_sn_nn"]')).toBeTruthy();
    expect(container.querySelector('[data-parity-key="station.internal.transformer.to.nn"]')).toBeTruthy();
    expect(container.querySelector('[data-parity-key="station.internal.bus.nn"]')).toBeTruthy();
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
    expect(getByText('0,4 MVA')).toBeInTheDocument();
    expect(getByText('15/0,4 kV')).toBeInTheDocument();
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
    expect(getByText(/Poziomy nN: 6 kV\s*\/\s*0,69 kV\s*\/\s*0,4 kV/)).toBeInTheDocument();
  });

  it('pokazuje PV przylaczone po nN z klikalnymi wylacznikami Q1/Q2', () => {
    const selected: string[] = [];
    const { container, getByText } = render(
      <StationInternalView
        substationId="st-pv"
        name="Stacja z PV"
        topologicalType="przelotowa"
        snVoltageKv={15}
        nnVoltageLevels={[0.4]}
        bays={[]}
        transformers={[]}
        nnSwitchgears={[]}
        ders={[{ derId: 'pv-1', kind: 'PV', connectionSide: 'nn', count: 2 }]}
        width={1000}
        height={680}
        onSelectBay={(id) => selected.push(id)}
      />,
    );

    expect(container.querySelector('[data-parity-key="station.internal.pv.nn_connection"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="station-internal-pv-nn-breaker-"][data-symbol-canon="circuit_breaker_square"]').length).toBe(2);
    expect(container.querySelectorAll('[data-element-kind="protection_relay"][data-protected-ref]').length).toBe(2);
    expect(container.querySelectorAll('[data-element-kind="pv_inverter"]').length).toBe(2);
    expect(getByText('PV nN')).toBeInTheDocument();

    const q1 = container.querySelector('[data-testid="station-internal-pv-nn-breaker-1"]');
    expect(q1).toBeTruthy();
    q1?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toContain('st-pv/pv/nn-breaker/Q1');

    const protection = container.querySelector('[data-testid="station-internal-pv-protection-1"]');
    protection?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toContain('st-pv/pv/protection/e2tango/Q1');
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
