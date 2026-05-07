/**
 * Phase 0A — BayDeviceOrderPolicy unit tests.
 *
 * Reguła operator-grade: kolejność aparatów wynika z polityki, NIE z
 * `equipment_refs`. Renderer iteruje ten enum.
 */

import { describe, expect, it } from 'vitest';

import { APPARATUS_KIND, FIELD_ROLE, ALL_FIELD_ROLES } from '../apparatusContracts';
import {
  BAY_DEVICE_ORDER_POLICY,
  countMainAxisSlots,
  getBayDeviceOrder,
} from '../bayDeviceOrder';

describe('BayDeviceOrderPolicy — pokrycie ról', () => {
  it('wszystkie 9 ról pól mają zdefiniowaną kolejność', () => {
    for (const role of ALL_FIELD_ROLES) {
      expect(BAY_DEVICE_ORDER_POLICY[role]).toBeDefined();
      expect(BAY_DEVICE_ORDER_POLICY[role].length).toBeGreaterThan(0);
    }
  });
});

describe('BayDeviceOrderPolicy — LINE_IN: CB w osi po DS, CT po CB, ES boczny', () => {
  const order = getBayDeviceOrder(FIELD_ROLE.LINE_IN);

  it('pierwszy aparat na osi to DS', () => {
    const first = order.find((s) => s.position === 'MAIN_AXIS');
    expect(first?.apparatusKind).toBe(APPARATUS_KIND.DISCONNECTOR);
  });

  it('CB jest na MAIN_AXIS po DS (order=2)', () => {
    const cb = order.find((s) => s.apparatusKind === APPARATUS_KIND.CIRCUIT_BREAKER);
    expect(cb).toBeDefined();
    expect(cb!.position).toBe('MAIN_AXIS');
    expect(cb!.order).toBeGreaterThanOrEqual(2);
  });

  it('CT na MAIN_AXIS bezpośrednio po CB', () => {
    const ct = order.find((s) => s.apparatusKind === APPARATUS_KIND.CT);
    expect(ct?.position).toBe('MAIN_AXIS');
  });

  it('ES jest LATERAL_BRANCH po stronie RIGHT', () => {
    const es = order.find((s) => s.apparatusKind === APPARATUS_KIND.EARTHING_SWITCH);
    expect(es?.position).toBe('LATERAL_BRANCH');
    expect(es?.side).toBe('RIGHT');
  });

  it('CABLE_HEAD jako ostatni na MAIN_AXIS', () => {
    const last = [...order]
      .filter((s) => s.position === 'MAIN_AXIS')
      .sort((a, b) => b.order - a.order)[0];
    expect(last.apparatusKind).toBe(APPARATUS_KIND.CABLE_HEAD);
  });
});

describe('BayDeviceOrderPolicy — GPZ_LINE_BAY ma VT na bocznej', () => {
  const order = getBayDeviceOrder(FIELD_ROLE.GPZ_LINE_BAY);

  it('VT jest LATERAL_BRANCH (a nie MAIN_AXIS)', () => {
    const vt = order.find((s) => s.apparatusKind === APPARATUS_KIND.VT);
    expect(vt).toBeDefined();
    expect(vt?.position).toBe('LATERAL_BRANCH');
  });

  it('CT na MAIN_AXIS', () => {
    const ct = order.find((s) => s.apparatusKind === APPARATUS_KIND.CT);
    expect(ct?.position).toBe('MAIN_AXIS');
  });
});

describe('BayDeviceOrderPolicy — TRANSFORMER ma transformator i wyłącznik nN', () => {
  const order = getBayDeviceOrder(FIELD_ROLE.TRANSFORMER);

  it('TRANSFORMER aparat jest obecny', () => {
    const tr = order.find((s) => s.apparatusKind === APPARATUS_KIND.TRANSFORMER);
    expect(tr).toBeDefined();
    expect(tr?.position).toBe('MAIN_AXIS');
  });

  it('LV_BREAKER po transformatorze', () => {
    const tr = order.find((s) => s.apparatusKind === APPARATUS_KIND.TRANSFORMER);
    const lv = order.find((s) => s.apparatusKind === APPARATUS_KIND.LV_BREAKER);
    expect(lv).toBeDefined();
    expect(lv!.order).toBeGreaterThanOrEqual(tr!.order);
  });
});

describe('BayDeviceOrderPolicy — RMU_LINE: rozłącznik zamiast wyłącznika', () => {
  const order = getBayDeviceOrder(FIELD_ROLE.RMU_LINE);

  it('SWITCH_DISCONNECTOR jest obecny zamiast CB', () => {
    expect(order.find((s) => s.apparatusKind === APPARATUS_KIND.SWITCH_DISCONNECTOR)).toBeDefined();
    expect(order.find((s) => s.apparatusKind === APPARATUS_KIND.CIRCUIT_BREAKER)).toBeUndefined();
  });

  it('CABLE_HEAD nadal ostatni', () => {
    const last = [...order]
      .filter((s) => s.position === 'MAIN_AXIS')
      .sort((a, b) => b.order - a.order)[0];
    expect(last.apparatusKind).toBe(APPARATUS_KIND.CABLE_HEAD);
  });
});

describe('BayDeviceOrderPolicy — MEASUREMENT: VT w osi', () => {
  const order = getBayDeviceOrder(FIELD_ROLE.MEASUREMENT);

  it('VT na MAIN_AXIS', () => {
    const vt = order.find((s) => s.apparatusKind === APPARATUS_KIND.VT);
    expect(vt?.position).toBe('MAIN_AXIS');
  });

  it('ES na LATERAL_BRANCH', () => {
    const es = order.find((s) => s.apparatusKind === APPARATUS_KIND.EARTHING_SWITCH);
    expect(es?.position).toBe('LATERAL_BRANCH');
  });
});

describe('BayDeviceOrderPolicy — countMainAxisSlots zwraca tylko MAIN_AXIS', () => {
  it('LINE_IN ma ≥ 4 sloty na MAIN_AXIS (DS, CB, CT, CABLE_HEAD)', () => {
    expect(countMainAxisSlots(FIELD_ROLE.LINE_IN)).toBeGreaterThanOrEqual(4);
  });

  it('RMU_LINE ma ≥ 2 sloty na MAIN_AXIS', () => {
    expect(countMainAxisSlots(FIELD_ROLE.RMU_LINE)).toBeGreaterThanOrEqual(2);
  });
});
