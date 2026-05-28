/**
 * Tests for K30-31 MiniBlockBayLayout — bay-column layout engine.
 */

import { describe, expect, it } from 'vitest';

import { FIELD_ROLE } from '../domain/apparatusContracts';
import {
  apparatusStackForRole,
  computeMiniBlockLayout,
  getVariantApparatusGap,
  getVariantApparatusHeight,
} from '../renderer/MiniBlockBayLayout';
import type { MiniBlockBayDescriptor } from '../renderer/MiniBlockRmuRenderer';

function mkBay(role: keyof typeof FIELD_ROLE, ref: string): MiniBlockBayDescriptor {
  return {
    bayRef: ref,
    fieldRole: FIELD_ROLE[role],
    designation: ref.toUpperCase(),
    hasMissingRequiredDevice: false,
  };
}

describe('apparatusStackForRole — IEC 60617 mapping', () => {
  it('LINE_IN/LINE_OUT → DS + CB + ES', () => {
    expect(apparatusStackForRole(FIELD_ROLE.LINE_IN)).toEqual(['DS', 'CB', 'ES']);
    expect(apparatusStackForRole(FIELD_ROLE.LINE_OUT)).toEqual(['DS', 'CB', 'ES']);
    expect(apparatusStackForRole(FIELD_ROLE.RMU_LINE)).toEqual(['DS', 'CB', 'ES']);
    expect(apparatusStackForRole(FIELD_ROLE.DER_PV)).toEqual(['DS', 'CB', 'ES']);
    expect(apparatusStackForRole(FIELD_ROLE.DER_BESS)).toEqual(['DS', 'CB', 'ES']);
    expect(apparatusStackForRole(FIELD_ROLE.DER_FW)).toEqual(['DS', 'CB', 'ES']);
  });

  it('TRANSFORMER → DS + CB (TR rendered separately as dedicated bay)', () => {
    expect(apparatusStackForRole(FIELD_ROLE.TRANSFORMER)).toEqual(['DS', 'CB']);
    expect(apparatusStackForRole(FIELD_ROLE.RMU_TRANSFORMER)).toEqual(['DS', 'CB']);
  });

  it('K30-120: MEASUREMENT → DS + VT + CT + ES (per BAY_DEVICE_ORDER_POLICY)', () => {
    // K30-120 audyt fix: zgodne z bayDeviceOrder.ts MEASUREMENT_ORDER
    // (DS mandatory → FUSE optional → VT mandatory → ES mandatory).
    expect(apparatusStackForRole(FIELD_ROLE.MEASUREMENT)).toEqual(['DS', 'VT', 'CT', 'ES']);
  });

  it('COUPLER → DS + CB + DS', () => {
    expect(apparatusStackForRole(FIELD_ROLE.COUPLER)).toEqual(['DS', 'CB', 'DS']);
  });
});

describe('computeMiniBlockLayout — basic structure', () => {
  it('1 bay → x=0 (single column centered)', () => {
    const layout = computeMiniBlockLayout(
      'detail',
      [mkBay('LINE_IN', 'B01')],
      false,
      0,
      false,
    );
    expect(layout.snColumns.length).toBe(1);
    expect(layout.snColumns[0].x).toBe(0);
  });

  it('3 bays detail variant → evenly spaced left-right', () => {
    const layout = computeMiniBlockLayout(
      'detail',
      [mkBay('LINE_IN', 'B01'), mkBay('LINE_OUT', 'B02'), mkBay('TRANSFORMER', 'B03')],
      true,
      4,
      false,
    );
    expect(layout.snColumns.length).toBe(3);
    expect(layout.snColumns[0].x).toBeLessThan(layout.snColumns[1].x);
    expect(layout.snColumns[1].x).toBeLessThan(layout.snColumns[2].x);
    // First @ busLeft, last @ busRight, middle @ midpoint
    const mid = (layout.snColumns[0].x + layout.snColumns[2].x) / 2;
    expect(layout.snColumns[1].x).toBeCloseTo(mid, 1);
  });

  it('overview variant limits to 4 visible bays', () => {
    const bays = Array.from({ length: 6 }, (_, i) =>
      mkBay('LINE_IN', `B0${i + 1}`),
    );
    const layout = computeMiniBlockLayout('overview', bays, false, 0, false);
    expect(layout.snColumns.length).toBe(4);
  });

  it('TR column identified gdy bay role TRANSFORMER', () => {
    const layout = computeMiniBlockLayout(
      'detail',
      [mkBay('LINE_IN', 'B01'), mkBay('TRANSFORMER', 'B02')],
      true,
      0,
      false,
    );
    expect(layout.trColumn).not.toBeNull();
    expect(layout.trColumn!.bay.bayRef).toBe('B02');
    expect(layout.trCenterY).not.toBeNull();
  });

  it('TR center Y below SN stack', () => {
    const layout = computeMiniBlockLayout(
      'detail',
      [mkBay('TRANSFORMER', 'B01')],
      true,
      2,
      false,
    );
    expect(layout.trCenterY).not.toBeNull();
    expect(layout.trCenterY!).toBeGreaterThan(layout.busY);
  });

  it('LV columns evenly distributed gdy nnFeedersCount > 0', () => {
    const layout = computeMiniBlockLayout(
      'detail',
      [mkBay('LINE_IN', 'B01'), mkBay('TRANSFORMER', 'B02')],
      true,
      4,
      false,
    );
    expect(layout.lvColumns.length).toBe(4);
    expect(layout.lvColumns[0].x).toBeLessThan(layout.lvColumns[1].x);
    expect(layout.lvColumns[1].x).toBeLessThan(layout.lvColumns[2].x);
    expect(layout.lvColumns[2].x).toBeLessThan(layout.lvColumns[3].x);
  });

  it('LV bus below TR (TR z hasTransformer=true)', () => {
    const layout = computeMiniBlockLayout(
      'detail',
      [mkBay('TRANSFORMER', 'B01')],
      true,
      2,
      false,
    );
    expect(layout.lvBusY).toBeGreaterThan(layout.busY);
    if (layout.trCenterY != null) {
      expect(layout.lvBusY).toBeGreaterThan(layout.trCenterY);
    }
  });

  it('Variant-aware dimensions: overview < compact < detail', () => {
    expect(getVariantApparatusHeight('overview')).toBeLessThan(getVariantApparatusHeight('compact'));
    expect(getVariantApparatusHeight('compact')).toBeLessThan(getVariantApparatusHeight('detail'));
    expect(getVariantApparatusGap('overview')).toBeLessThan(getVariantApparatusGap('compact'));
  });

  it('No transformer → no LV bus separation (LV directly below stack)', () => {
    const layout = computeMiniBlockLayout(
      'detail',
      [mkBay('LINE_IN', 'B01')],
      false,
      0,
      false,
    );
    expect(layout.trColumn).toBeNull();
    expect(layout.trCenterY).toBeNull();
  });

  it('Multi-feeder K30-25 demo: 5 feeders w 5 distinct columns', () => {
    const layout = computeMiniBlockLayout(
      'detail',
      [mkBay('LINE_IN', 'B01'), mkBay('TRANSFORMER', 'B02')],
      true,
      5,
      false,
    );
    expect(layout.lvColumns.length).toBe(5);
    // All x values must be unique
    const xs = layout.lvColumns.map((c) => c.x);
    expect(new Set(xs).size).toBe(5);
  });
});
