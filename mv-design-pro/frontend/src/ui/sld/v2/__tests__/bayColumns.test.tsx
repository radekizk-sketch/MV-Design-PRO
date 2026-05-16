/**
 * Tests for K30-31 BayColumnSn + BayColumnLv — bay-column renderers.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { FIELD_ROLE } from '../domain/apparatusContracts';
import { BayColumnLv } from '../renderer/BayColumnLv';
import { BayColumnSn } from '../renderer/BayColumnSn';

function wrap(child: React.ReactNode) {
  return (
    <svg width={400} height={400}>
      {child}
    </svg>
  );
}

describe('BayColumnSn — SN bay column z apparatus stack', () => {
  it('LINE_IN bay renderuje 3 apparatus (DS, CB, ES)', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.LINE_IN}
          bayRef="B01"
          designation="Q1"
          apparatusStack={['DS', 'CB', 'ES']}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    expect(container.querySelector('[data-testid="sld-v2-bay-column-sn-B01"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-bay-apparatus-slot="DS"]').length).toBe(1);
    expect(container.querySelectorAll('[data-bay-apparatus-slot="CB"]').length).toBe(1);
    expect(container.querySelectorAll('[data-bay-apparatus-slot="ES"]').length).toBe(1);
  });

  it('TRANSFORMER bay renderuje 2 apparatus (DS, CB) — TR symbol rendered separately', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={10}
          busY={-10}
          bayRole={FIELD_ROLE.TRANSFORMER}
          bayRef="B02"
          designation="Q2"
          apparatusStack={['DS', 'CB']}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    expect(container.querySelectorAll('[data-bay-apparatus-slot]').length).toBe(2);
    expect(container.querySelector('[data-bay-role="TRANSFORMER"]')).toBeTruthy();
  });

  it('MEASUREMENT bay renderuje VT + CT (no CB)', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.MEASUREMENT}
          bayRef="BM"
          designation="VT1"
          apparatusStack={['VT', 'CT']}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    expect(container.querySelectorAll('[data-bay-apparatus-slot="VT"]').length).toBe(1);
    expect(container.querySelectorAll('[data-bay-apparatus-slot="CT"]').length).toBe(1);
    expect(container.querySelectorAll('[data-bay-apparatus-slot="CB"]').length).toBe(0);
  });

  it('Bus junction + outgoing point renderowane jako circles', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.LINE_IN}
          bayRef="B01"
          designation="Q1"
          apparatusStack={['DS', 'CB', 'ES']}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    expect(container.querySelector('[data-testid="sld-v2-bay-B01-bus-junction"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-bay-B01-outgoing"]')).toBeTruthy();
  });

  it('Designation label visible w detail variant', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.LINE_IN}
          bayRef="B01"
          designation="Q11"
          apparatusStack={['DS', 'CB']}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    const label = container.querySelector('[data-testid="sld-v2-bay-B01-designation"]');
    expect(label?.textContent).toBe('Q11');
  });

  it('K30-124: Designation VISIBLE w overview variant z mniejszą czcionką (UX consistency)', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.LINE_IN}
          bayRef="B01"
          designation="Q11"
          apparatusStack={['DS']}
          variant="overview"
          stationId="stn1"
        />,
      ),
    );
    // K30-124: label always present (anti-flickering), tylko fontSize różny per LOD
    const label = container.querySelector('[data-testid="sld-v2-bay-B01-designation"]');
    expect(label).not.toBeNull();
    expect(label?.getAttribute('font-size')).toBe('7'); // overview = 7px
  });

  it('Missing indicator pokazany gdy hasMissing=true', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.LINE_IN}
          bayRef="B01"
          designation="Q1"
          apparatusStack={['DS']}
          variant="detail"
          stationId="stn1"
          hasMissing
        />,
      ),
    );
    expect(container.querySelector('[data-testid="sld-v2-bay-B01-missing-indicator"]')).toBeTruthy();
  });
});


describe('BayColumnLv — LV feeder column', () => {
  it('Renderuje LV CB + bus junction + outgoing point', () => {
    const { container } = render(
      wrap(
        <BayColumnLv
          x={0}
          lvBusY={20}
          index={0}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    expect(container.querySelector('[data-testid="sld-v2-bay-column-lv-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-lv-0-bus-junction"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-lv-0-cb"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-lv-0-outgoing"]')).toBeTruthy();
  });

  it('Load label visible w detail variant gdy loadKw > 0', () => {
    const { container } = render(
      wrap(
        <BayColumnLv
          x={0}
          lvBusY={20}
          index={0}
          variant="detail"
          stationId="stn1"
          loadKw={250}
        />,
      ),
    );
    const lbl = container.querySelector('[data-testid="sld-v2-lv-0-load"]');
    expect(lbl?.textContent).toBe('250kW');
  });

  it('Load label formats MW dla >=1000 kW', () => {
    const { container } = render(
      wrap(
        <BayColumnLv
          x={0}
          lvBusY={20}
          index={0}
          variant="detail"
          stationId="stn1"
          loadKw={1500}
        />,
      ),
    );
    const lbl = container.querySelector('[data-testid="sld-v2-lv-0-load"]');
    expect(lbl?.textContent).toBe('1.5MW');
  });

  it('Load label NIE renderowany w overview variant', () => {
    const { container } = render(
      wrap(
        <BayColumnLv
          x={0}
          lvBusY={20}
          index={0}
          variant="overview"
          stationId="stn1"
          loadKw={250}
        />,
      ),
    );
    expect(container.querySelector('[data-testid="sld-v2-lv-0-load"]')).toBeNull();
  });

  it('feederIndex attr propagated', () => {
    const { container } = render(
      wrap(
        <BayColumnLv
          x={0}
          lvBusY={20}
          index={3}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    const col = container.querySelector('[data-testid="sld-v2-bay-column-lv-3"]');
    expect(col?.getAttribute('data-feeder-index')).toBe('3');
  });
});
