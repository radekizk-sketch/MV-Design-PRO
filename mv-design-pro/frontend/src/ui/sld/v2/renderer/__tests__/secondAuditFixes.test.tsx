/**
 * K30-120..124: drugi pełny audyt RMU — fixes po pierwszych poprawkach.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BayColumnSn } from '../BayColumnSn';
import { apparatusStackForRole } from '../MiniBlockBayLayout';
import { FIELD_ROLE } from '../../domain/apparatusContracts';

afterEach(() => cleanup());

const wrap = (children: React.ReactNode) => <svg>{children}</svg>;

describe('MEASUREMENT apparatus stack (per BAY_DEVICE_ORDER_POLICY)', () => {
  it('MEASUREMENT zwraca [DS, VT, CT, ES] (nie tylko [VT, CT])', () => {
    expect(apparatusStackForRole(FIELD_ROLE.MEASUREMENT)).toEqual(['DS', 'VT', 'CT', 'ES']);
  });

  it('ES present w MEASUREMENT stack — safety-critical BHP', () => {
    expect(apparatusStackForRole(FIELD_ROLE.MEASUREMENT)).toContain('ES');
  });

  it('DS present w MEASUREMENT stack — isolation per IEC 62271-102', () => {
    expect(apparatusStackForRole(FIELD_ROLE.MEASUREMENT)).toContain('DS');
  });
});

describe('Designation label anti-collision z DS lever', () => {
  it('DS w stack → label offset x+8 + anchor start (anti-collision)', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={100}
          busY={-10}
          bayRole={FIELD_ROLE.LINE_IN}
          bayRef="B01"
          designation="Q1"
          apparatusStack={['DS', 'CB']}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    const label = container.querySelector('[data-testid="sld-v2-bay-B01-designation"]');
    expect(label?.getAttribute('text-anchor')).toBe('start');
    expect(label?.getAttribute('x')).toBe('108'); // x=100 + 8
  });

  it('BRAK DS w stack → label centered (x=100, anchor middle)', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={100}
          busY={-10}
          bayRole={FIELD_ROLE.MEASUREMENT}
          bayRef="B01"
          designation="VT1"
          apparatusStack={['VT', 'CT']}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    const label = container.querySelector('[data-testid="sld-v2-bay-B01-designation"]');
    expect(label?.getAttribute('text-anchor')).toBe('middle');
    expect(label?.getAttribute('x')).toBe('100');
  });
});

describe('Designation label LOD scaling', () => {
  it('overview variant → fontSize 7', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.LINE_IN}
          bayRef="B01"
          designation="Q1"
          apparatusStack={['DS']}
          variant="overview"
          stationId="stn1"
        />,
      ),
    );
    expect(container.querySelector('[data-testid="sld-v2-bay-B01-designation"]')?.getAttribute('font-size')).toBe('7');
  });

  it('compact variant → fontSize 8', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.LINE_IN}
          bayRef="B01"
          designation="Q1"
          apparatusStack={['DS']}
          variant="compact"
          stationId="stn1"
        />,
      ),
    );
    expect(container.querySelector('[data-testid="sld-v2-bay-B01-designation"]')?.getAttribute('font-size')).toBe('8');
  });

  it('detail variant → fontSize 9', () => {
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
        />,
      ),
    );
    expect(container.querySelector('[data-testid="sld-v2-bay-B01-designation"]')?.getAttribute('font-size')).toBe('9');
  });
});
