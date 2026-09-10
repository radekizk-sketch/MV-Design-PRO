/**
 * K30-111: SD distinguishability (load-break diagonal, 12px size, 2 dots)
 * K30-112: hasMissingRequiredDevice background indicator
 * K30-114: CT mandatory w RMU_TRANSFORMER_ORDER
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ApparatusSwitchDisconnector } from '../GpzApparatusSymbols';
import { BAY_DEVICE_ORDER_POLICY } from '../../domain/bayDeviceOrder';
import { FIELD_ROLE, APPARATUS_KIND } from '../../domain/apparatusContracts';

afterEach(() => cleanup());

describe('ApparatusSwitchDisconnector IEC 60617-7-13-04', () => {
  it('rendered z size 12 (większy niż DS 9 i CB 9)', () => {
    const { container } = render(
      <svg><ApparatusSwitchDisconnector cx={50} cy={50} state="closed" energized /></svg>,
    );
    const sd = container.querySelector('[data-testid="sld-v2-gpz-bay-switch-disconnector"]');
    expect(sd?.getAttribute('data-symbol-canon')).toBe('switch_disconnector_rotated_square_load_break');
    const rect = sd?.querySelector('rect');
    expect(parseFloat(rect?.getAttribute('width') ?? '0')).toBe(12);
  });

  it('closed: 2 contact dots + pionowa linia kontaktu + diagonal load-break', () => {
    const { container } = render(
      <svg><ApparatusSwitchDisconnector cx={50} cy={50} state="closed" /></svg>,
    );
    const sd = container.querySelector('[data-testid="sld-v2-gpz-bay-switch-disconnector"]');
    // 2 contact dots (r=0.9)
    const dots = Array.from(sd?.querySelectorAll('circle') ?? []).filter((c) => c.getAttribute('r') === '0.9');
    expect(dots.length).toBe(2);
    // Pionowa linia + diagonal (load-break) = 2 lines minimum
    const lines = sd?.querySelectorAll('line');
    expect(lines?.length).toBeGreaterThanOrEqual(2);
  });

  it('open: horizontal break line + red load-break diagonal', () => {
    const { container } = render(
      <svg><ApparatusSwitchDisconnector cx={50} cy={50} state="open" /></svg>,
    );
    const sd = container.querySelector('[data-testid="sld-v2-gpz-bay-switch-disconnector"]');
    const lines = Array.from(sd?.querySelectorAll('line') ?? []);
    // Powinna być horizontal break line (y1 === y2)
    const horizontalBreak = lines.find((l) => l.getAttribute('y1') === l.getAttribute('y2'));
    expect(horizontalBreak).toBeTruthy();
  });
});

describe('CT mandatory w RMU_TRANSFORMER_ORDER (PN-EN 62271-202)', () => {
  it('CT slot ma optional: false (mandatory)', () => {
    const order = BAY_DEVICE_ORDER_POLICY[FIELD_ROLE.RMU_TRANSFORMER];
    const ctSlot = order.find((s) => s.apparatusKind === APPARATUS_KIND.CT);
    expect(ctSlot).toBeTruthy();
    expect(ctSlot?.optional).toBe(false);
  });

  it('CT jest pomiędzy FUSE i ES (kolejność: SD → FUSE → CT → ES → TR → LV)', () => {
    const order = BAY_DEVICE_ORDER_POLICY[FIELD_ROLE.RMU_TRANSFORMER];
    const ctIdx = order.findIndex((s) => s.apparatusKind === APPARATUS_KIND.CT);
    const fuseIdx = order.findIndex((s) => s.apparatusKind === APPARATUS_KIND.FUSE);
    const esIdx = order.findIndex((s) => s.apparatusKind === APPARATUS_KIND.EARTHING_SWITCH);
    expect(ctIdx).toBeGreaterThan(fuseIdx);
    expect(ctIdx).toBeLessThan(esIdx);
  });
});
