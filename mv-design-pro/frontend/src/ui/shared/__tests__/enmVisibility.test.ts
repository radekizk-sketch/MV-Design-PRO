import { describe, expect, it } from 'vitest';

import { findOperationalBus, isInlineHelperBus, isOperationalBus } from '../enmVisibility';

describe('enmVisibility', () => {
  it('classifies helper buses from explicit metadata', () => {
    expect(
      isInlineHelperBus({
        ref_id: 'bus/a',
        tags: ['helper_bus'],
        meta: {},
      } as any),
    ).toBe(true);
  });

  it('classifies legacy downstream helper buses by ref_id heuristic', () => {
    expect(
      isInlineHelperBus({
        ref_id: 'bus/abc/downstream',
        name: 'Szyna downstream',
      } as any),
    ).toBe(true);
  });

  it('keeps operational GPZ bus visible', () => {
    expect(
      isOperationalBus({
        ref_id: 'gpz/abc/bus_sn',
        name: 'Szyna GPZ 15 kV',
      } as any),
    ).toBe(true);
  });

  it('findOperationalBus skips helper bus and returns only operational match', () => {
    const snapshot = {
      buses: [
        { ref_id: 'bus/abc/downstream', id: 'bus/abc/downstream', name: 'Szyna downstream', voltage_kv: 15 },
        { ref_id: 'bus/gpz', id: 'bus/gpz', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
      ],
    } as any;

    expect(findOperationalBus(snapshot, 'bus/abc/downstream')).toBeNull();
    expect(findOperationalBus(snapshot, 'bus/gpz')?.name).toBe('Szyna GPZ 15 kV');
  });
});
